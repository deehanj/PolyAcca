/**
 * PUT handler for chains
 *
 * - PUT /chains/{chainId} - Update chain customization (name, description, image)
 *
 * Only allowed if chain doesn't already have a name (first-come-first-served)
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { getChain, updateChainCustomization } from '../../shared/dynamo-client';
import type { UpdateChainRequest } from '../../shared/types';
import { errorResponse, successResponse, toChainSummary } from './utils';
import { optionalEnvVar } from '../../utils/envVars';

// Image dimensions - square crop like pump.fun
const IMAGE_SIZE = 400;

// Environment variables (optional - image upload requires this)
const CHAIN_IMAGES_BUCKET = optionalEnvVar('CHAIN_IMAGES_BUCKET');

// Lazy-initialized clients
let s3Client: S3Client | null = null;
let rekognitionClient: RekognitionClient | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

function getRekognitionClient(): RekognitionClient {
  if (!rekognitionClient) {
    rekognitionClient = new RekognitionClient({});
  }
  return rekognitionClient;
}

// Allowed content types
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

// Max image size: 1MB (Base64 adds ~33% overhead, so ~750KB raw)
const MAX_IMAGE_SIZE_BYTES = 1 * 1024 * 1024;

// Rekognition moderation confidence threshold
const MODERATION_CONFIDENCE_THRESHOLD = 75;

/**
 * Process image: crop to square and resize to standard dimensions
 * Uses center crop like pump.fun
 */
async function processImage(imageBytes: Buffer): Promise<Buffer> {
  const image = sharp(imageBytes);
  const metadata = await image.metadata();

  const width = metadata.width || IMAGE_SIZE;
  const height = metadata.height || IMAGE_SIZE;

  // Calculate square crop dimensions (center crop)
  const size = Math.min(width, height);
  const left = Math.floor((width - size) / 2);
  const top = Math.floor((height - size) / 2);

  // Crop to square, resize to standard size, output as JPEG for consistency
  return image
    .extract({ left, top, width: size, height: size })
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Check image for inappropriate content using Rekognition
 */
async function moderateImage(imageBytes: Buffer): Promise<{ safe: boolean; labels: string[] }> {
  const client = getRekognitionClient();

  const response = await client.send(
    new DetectModerationLabelsCommand({
      Image: { Bytes: imageBytes },
      MinConfidence: MODERATION_CONFIDENCE_THRESHOLD,
    })
  );

  const flaggedLabels = (response.ModerationLabels || [])
    .filter((label) => (label.Confidence || 0) >= MODERATION_CONFIDENCE_THRESHOLD)
    .map((label) => label.Name || 'Unknown');

  return {
    safe: flaggedLabels.length === 0,
    labels: flaggedLabels,
  };
}

/**
 * Upload image to S3 and return the S3 key
 * Frontend constructs the full CloudFront URL using its own env var
 * Images are always stored as JPEG after processing
 */
async function uploadImageToS3(
  imageBytes: Buffer,
  chainId: string
): Promise<string> {
  if (!CHAIN_IMAGES_BUCKET) {
    throw new Error('Image upload not configured');
  }

  const client = getS3Client();
  // Always use .jpg since we convert to JPEG during processing
  const key = `chains/${chainId}/${randomUUID().slice(0, 8)}.jpg`;

  await client.send(
    new PutObjectCommand({
      Bucket: CHAIN_IMAGES_BUCKET,
      Key: key,
      Body: imageBytes,
      ContentType: 'image/jpeg',
    })
  );

  // Return the S3 key - frontend will prepend CloudFront domain
  return key;
}

/**
 * PUT /chains/{chainId} - Update chain customization
 */
export async function updateChain(
  chainId: string,
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let request: UpdateChainRequest;
  try {
    request = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  // All fields are required
  if (!request.name || request.name.trim().length === 0) {
    return errorResponse(400, 'Name is required');
  }

  if (!request.description || request.description.trim().length === 0) {
    return errorResponse(400, 'Description is required');
  }

  if (!request.imageData) {
    return errorResponse(400, 'Image is required');
  }

  // Validate name length
  if (request.name.length > 100) {
    return errorResponse(400, 'Name must be 100 characters or less');
  }

  // Validate description length
  if (request.description.length > 500) {
    return errorResponse(400, 'Description must be 500 characters or less');
  }

  // Check chain exists
  const chain = await getChain(chainId);
  if (!chain) {
    return errorResponse(404, 'Chain not found');
  }

  // Check if chain already has a name (first-come-first-served)
  if (chain.name) {
    return errorResponse(409, 'Chain already has a name and cannot be modified');
  }

  // Validate image content type
  if (!request.imageContentType || !ALLOWED_CONTENT_TYPES.includes(request.imageContentType)) {
    return errorResponse(400, `Invalid image type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`);
  }

  // Check if image upload is configured
  if (!CHAIN_IMAGES_BUCKET) {
    return errorResponse(500, 'Image upload not configured');
  }

  // Decode Base64
  let imageBytes: Buffer;
  try {
    imageBytes = Buffer.from(request.imageData, 'base64');
  } catch {
    return errorResponse(400, 'Invalid Base64 image data');
  }

  // Check size
  if (imageBytes.length > MAX_IMAGE_SIZE_BYTES) {
    return errorResponse(400, `Image too large. Maximum size: ${MAX_IMAGE_SIZE_BYTES / 1024}KB`);
  }

  // Minimum size check (to avoid tiny/empty images)
  if (imageBytes.length < 1000) {
    return errorResponse(400, 'Image too small or invalid');
  }

  // Process image: crop to square and resize to standard 400x400
  let processedImage: Buffer;
  try {
    processedImage = await processImage(imageBytes);
    console.log(`Image processed: ${imageBytes.length} bytes -> ${processedImage.length} bytes`);
  } catch (error) {
    console.error('Image processing error:', error);
    return errorResponse(400, 'Failed to process image. Please try a different image.');
  }

  // Run moderation check on processed image
  let moderation;
  try {
    moderation = await moderateImage(processedImage);
    if (!moderation.safe) {
      console.warn(`Image rejected for chain ${chainId}: ${moderation.labels.join(', ')}`);
      return errorResponse(400, 'Image contains inappropriate content and was rejected');
    }
  } catch (error) {
    console.error('Rekognition moderation error:', error);
    return errorResponse(500, 'Failed to verify image content');
  }

  // Upload processed image to S3
  let imageKey: string;
  try {
    imageKey = await uploadImageToS3(processedImage, chainId);
  } catch (error) {
    console.error('S3 upload error:', error);
    return errorResponse(500, 'Failed to upload image');
  }

  // Update chain
  try {
    await updateChainCustomization(chainId, {
      name: request.name?.trim(),
      description: request.description?.trim(),
      imageKey,
    });
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') {
      return errorResponse(409, 'Chain already has a name and cannot be modified');
    }
    throw error;
  }

  // Return updated chain
  const updatedChain = await getChain(chainId);
  if (!updatedChain) {
    return errorResponse(500, 'Failed to retrieve updated chain');
  }

  return successResponse(toChainSummary(updatedChain));
}
