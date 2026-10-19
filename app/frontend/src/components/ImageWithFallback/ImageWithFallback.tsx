import { CircleQuestionMark } from "lucide-react";
import { type ImgHTMLAttributes, type SyntheticEvent, useState } from "react";
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
  const [imageState, setImageState] = useState<{
    src: string;
    status: "loading" | "fallback" | "loaded" | "error";
    usingFallback: boolean;
  }>({ src, status: "loading", usingFallback: false });

  if (imageState.src !== src) {
    setImageState({ src, status: "loading", usingFallback: false });
  }
  const isLoading =
    imageState.status === "loading" || imageState.status === "fallback";
  const hasError = imageState.status === "error";
  const imgSrc = imageState.usingFallback ? fallbackSrc : src;

  const handleError = () => {
    if (fallbackSrc && !imageState.usingFallback) {
      setImageState({ src, status: "fallback", usingFallback: true });
      return;
    }
    setImageState({
      src,
      status: "error",
      usingFallback: imageState.usingFallback,
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
        fill && "absolute inset-0 h-full w-full",
        isLoading && "animate-pulse",
        props.className,
      )}
      src={imgSrc}
      alt={alt}
      loading={priority ? "eager" : (props.loading ?? "lazy")}
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
