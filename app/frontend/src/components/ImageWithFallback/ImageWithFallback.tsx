import { CircleQuestionMark } from "lucide-react";
import { type ImgHTMLAttributes, type SyntheticEvent, useState } from "react";
import { cn } from "@/lib/utils";

interface ImageWithFallbackProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onError" | "src"> {
  src: string;
  fallbackSrc?: string;
  showErrorIcon?: boolean;
}

const ImageWithFallback = ({
  src,
  fallbackSrc,
  showErrorIcon = true,
  alt,
  onLoad,
  ...props
}: ImageWithFallbackProps) => {
  const [imageState, setImageState] = useState<{
    src: string;
    status: "loading" | "loaded" | "error";
    usingFallback: boolean;
  }>({ src, status: "loading", usingFallback: false });

  if (imageState.src !== src) {
    setImageState({ src, status: "loading", usingFallback: false });
  }
  const isLoading = imageState.status === "loading";
  const hasError = imageState.status === "error";
  const imgSrc = imageState.usingFallback ? fallbackSrc : src;

  const handleError = () => {
    setImageState((current) => {
      if (current.src !== src || current.status === "error") return current;
      const shouldUseFallback = Boolean(fallbackSrc && !current.usingFallback);
      return {
        src,
        status: shouldUseFallback ? "loading" : "error",
        usingFallback: current.usingFallback || shouldUseFallback,
      };
    });
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
        isLoading && "animate-pulse",
        props.className,
      )}
      src={imgSrc}
      alt={alt}
      loading={props.loading ?? "lazy"}
      decoding={props.decoding ?? "async"}
      onError={handleError}
      onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
        setImageState({
          src,
          status: "loaded",
          usingFallback: imageState.usingFallback,
        });
        onLoad?.(event);
      }}
    />
  );
};

export { ImageWithFallback };
