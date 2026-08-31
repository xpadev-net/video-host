import { CircleQuestionMark } from "lucide-react";
import {
  type ImgHTMLAttributes,
  type SyntheticEvent,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface ImageWithFallbackProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onError" | "src"> {
  src: string;
  fallbackSrc?: string;
  showErrorIcon?: boolean;
  fill?: boolean;
  priority?: boolean;
}

const ImageWithFallback = ({
  src,
  fallbackSrc,
  showErrorIcon = true,
  fill = false,
  priority = false,
  alt,
  onLoad,
  ...props
}: ImageWithFallbackProps) => {
  const [imgSrc, setImgSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setImgSrc(src);
    setIsLoading(true);
    setHasError(false);
    setUsedFallback(false);
  }, [src]);

  const handleError = () => {
    if (fallbackSrc && !usedFallback) {
      setImgSrc(fallbackSrc);
      setIsLoading(true);
      setUsedFallback(true);
      return;
    }
    setHasError(true);
  };

  if (hasError && showErrorIcon) {
    return (
      <div className="bg-skeleton w-full h-full flex items-center justify-center">
        <CircleQuestionMark />
      </div>
    );
  }

  return (
    <img
      {...props}
      className={cn(
        "bg-skeleton",
        fill && "absolute inset-0 h-full w-full",
        isLoading && "animate-pulse",
        props.className,
      )}
      src={imgSrc}
      alt={alt}
      loading={priority ? "eager" : props.loading}
      onError={handleError}
      onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
        setIsLoading(false);
        onLoad?.(event);
      }}
    />
  );
};

export { ImageWithFallback };
