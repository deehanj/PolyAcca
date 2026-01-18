import { useState, useEffect } from "react";

interface TypewriterTextProps {
  text: string;
  className?: string;
  delay?: number;
  speed?: number;
  cursor?: boolean;
  hideCursorOnComplete?: boolean;
}

export function TypewriterText({
  text,
  className = "",
  delay = 0,
  speed = 50,
  cursor = true,
  hideCursorOnComplete = false,
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let charIndex = 0;

    // Reset
    setDisplayText("");
    setIsTyping(false);
    setIsComplete(false);

    const startTyping = () => {
      setIsTyping(true);
      const typeChar = () => {
        if (charIndex < text.length) {
          setDisplayText(text.substring(0, charIndex + 1));
          charIndex++;
          timeoutId = setTimeout(typeChar, speed + Math.random() * 20); // Add randomness for realism
        } else {
          setIsTyping(false);
          setIsComplete(true);
        }
      };
      typeChar();
    };

    timeoutId = setTimeout(startTyping, delay);

    return () => clearTimeout(timeoutId);
  }, [text, delay, speed]);

  // Blinking cursor effect
  useEffect(() => {
    if (!cursor) return;
    
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, [cursor]);

  const shouldShowCursor = cursor && (!hideCursorOnComplete || !isComplete);

  return (
    <span className={className}>
      {displayText}
      {shouldShowCursor && (
        <span
          className={`inline-block w-[0.1em] h-[1em] ml-[0.1em] align-middle bg-current transition-opacity ${
            showCursor || isTyping ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}
