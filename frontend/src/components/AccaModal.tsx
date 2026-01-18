import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogTitle, DialogDescription } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useAuth } from "../hooks/useAuth";
import { Share2, Copy, Check, Upload, X, Loader2, ExternalLink } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const CHAIN_IMAGES_DOMAIN = import.meta.env.VITE_CHAIN_IMAGES_DOMAIN || "";

interface ChainData {
  chainId: string;
  name?: string;
  description?: string;
  imageKey?: string; // S3 key - we construct the full CloudFront URL
  chain: string[];
  totalValue: number;
  status: string;
}

interface AccaModalProps {
  chainId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AccaModal({ chainId, isOpen, onClose }: AccaModalProps) {
  const { getAuthHeaders } = useAuth();
  const [mode, setMode] = useState<"loading" | "customize" | "share">("loading");
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Customization form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Share state
  const [copied, setCopied] = useState(false);

  // Fetch chain data function
  const fetchChainData = useCallback(async () => {
    if (!chainId) return;

    setMode("loading");
    setError(null);

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load chain");
      }

      const chain = data.data?.chainDefinition || data.data;
      setChainData(chain);

      // Determine mode based on whether chain has name
      if (chain.name) {
        setMode("share");
      } else {
        setMode("customize");
      }
    } catch (err) {
      console.error("Failed to fetch chain:", err);
      setError(err instanceof Error ? err.message : "Failed to load chain");
      setMode("customize");
    }
  }, [chainId, getAuthHeaders]);

  // Fetch chain data when modal opens
  useEffect(() => {
    if (isOpen && chainId) {
      fetchChainData();
    } else {
      // Reset state when modal closes
      setMode("loading");
      setChainData(null);
      setError(null);
      setName("");
      setDescription("");
      setImageFile(null);
      setImagePreview("");
    }
  }, [isOpen, chainId, fetchChainData]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      setError("Please select a JPEG or PNG image");
      return;
    }

    // Validate file size (max 1MB for Base64 upload)
    if (file.size > 1 * 1024 * 1024) {
      setError("Image must be less than 1MB");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const handleSubmitCustomization = async () => {
    if (!chainId) return;

    // Validate all required fields
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!description.trim()) {
      setError("Description is required");
      return;
    }

    if (!imageFile) {
      setError("Image is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Convert image to Base64
      const buffer = await imageFile.arrayBuffer();
      const imageData = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );
      const imageContentType = imageFile.type;

      const response = await fetch(`${API_URL}/chains/${chainId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          imageData,
          imageContentType,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save customization");
      }

      // Update chain data and switch to share mode
      setChainData(data.data);
      setMode("share");
    } catch (err) {
      console.error("Failed to save customization:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getShareUrl = () => {
    // TODO: Update with actual share URL format
    return `${window.location.origin}/acca/${chainId}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: chainData?.name || "Check out my accumulator!",
          text: chainData?.description || `${chainData?.chain?.length || 0}-leg accumulator`,
          url: getShareUrl(),
        });
      } catch (err) {
        // User cancelled or error
        console.error("Share failed:", err);
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      {mode === "loading" && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-gold)]" />
        </div>
      )}

      {mode === "customize" && (
        <>
          <DialogTitle>Customize Your Acca</DialogTitle>
          <DialogDescription>
            Be the first to name this accumulator! All fields are required.
          </DialogDescription>

          <div className="space-y-4">
            {/* Name Input */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 block">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Give your acca a name..."
                maxLength={100}
                className="bg-black/20 border-white/10 focus:border-[var(--color-gold)]"
              />
            </div>

            {/* Description Input */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 block">
                Description <span className="text-destructive">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your accumulator..."
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 focus:border-[var(--color-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--color-gold)] text-sm resize-none"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 block">
                Image <span className="text-destructive">*</span>
              </label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={handleImageSelect}
                className="hidden"
                id="acca-modal-image"
              />
              {imagePreview ? (
                <div className="relative h-32 rounded-lg overflow-hidden border border-white/10 group">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="acca-modal-image"
                  className="h-32 rounded-lg border border-dashed border-white/20 hover:border-[var(--color-gold)]/50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-muted-foreground hover:text-[var(--color-gold)]"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-xs">Click to upload (max 1MB)</span>
                  <span className="text-[10px] text-muted-foreground/50">JPEG or PNG</span>
                </label>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="text-xs text-destructive p-3 bg-destructive/10 rounded-lg border border-destructive/20 flex items-center gap-2">
                <X className="h-3 w-3" /> {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                onClick={handleSubmitCustomization}
                disabled={isSubmitting || !name.trim() || !description.trim() || !imageFile}
                className="flex-1 bg-[var(--color-gold)] text-black hover:bg-[var(--color-gold-bright)]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & Share"
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {mode === "share" && chainData && (
        <>
          <DialogTitle>Share Your Acca</DialogTitle>
          <DialogDescription>
            Your accumulator is live! Share it with friends.
          </DialogDescription>

          {/* Chain Preview */}
          <div className="bg-black/20 rounded-lg p-4 mb-4 border border-white/10">
            {chainData.imageKey && CHAIN_IMAGES_DOMAIN && (
              <img
                src={`https://${CHAIN_IMAGES_DOMAIN}/${chainData.imageKey}`}
                alt={chainData.name}
                className="w-full h-32 object-cover rounded-lg mb-3"
              />
            )}
            <h3 className="font-bold text-lg text-[var(--color-gold)]">
              {chainData.name || `${chainData.chain?.length || 0}-Leg Accumulator`}
            </h3>
            {chainData.description && (
              <p className="text-sm text-muted-foreground mt-1">{chainData.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>{chainData.chain?.length || 0} legs</span>
              <span>${chainData.totalValue?.toFixed(2) || "0.00"} total staked</span>
            </div>
          </div>

          {/* Share URL */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm truncate text-muted-foreground">
              {getShareUrl()}
            </div>
            <Button
              variant="outline"
              onClick={handleCopyLink}
              className="shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-[var(--color-success)]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Close
            </Button>
            <Button
              onClick={handleShare}
              className="flex-1 bg-[var(--color-gold)] text-black hover:bg-[var(--color-gold-bright)]"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>

          {/* View Chain Link */}
          <div className="text-center mt-4">
            <a
              href={getShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--color-gold)] hover:underline inline-flex items-center gap-1"
            >
              View your accumulator
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </Dialog>
  );
}
