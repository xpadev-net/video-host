import { Link, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import {
  type ForwardedRef,
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSeriesSuggest } from "@/hooks/useSeriesSuggest";
import { useIsMobile } from "@/libraries/isMobile";
import { useForwardRef } from "@/libraries/useForwardRef";

type props = {
  className?: string;
};

const Search_ = ({ className }: props, ref: ForwardedRef<HTMLInputElement>) => {
  const [input, setInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggest = useSeriesSuggest({ query: input });
  const inputRef = useForwardRef<HTMLInputElement>(ref);
  const isMobile = useIsMobile();

  useEffect(
    () => () => {
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
    },
    [],
  );

  const navigate = useNavigate();
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (
      !e.nativeEvent.isComposing &&
      e.key === "Enter" &&
      input.trim().length > 1
    ) {
      void navigate({ to: "/search/$query", params: { query: input.trim() } });
      inputRef.current?.blur();
      setShowSuggest(false);
    }
  };
  const onSearchClick = () => {
    if (input.trim().length > 1) {
      void navigate({ to: "/search/$query", params: { query: input.trim() } });
      setShowSuggest(false);
    }
  };

  const onSuggestItemClick = () => {
    setShowSuggest(false);
  };

  return (
    <div className={`px-1 flex h-8 ${className || ""}`}>
      <div className="relative bg-thirdly-background border border-quaternary-background border-r-0 flex-1 p-0.5 px-1.5 group rounded-l-sm">
        <input
          type="text"
          ref={inputRef}
          className="outline-none border-none bg-transparent text-base font-normal leading-6 ml-1 w-full placeholder:text-[var(--color-sub-text)]"
          placeholder={"検索"}
          onKeyDown={onKeyDown}
          value={input}
          id={"headerSearchInput"}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            if (blurTimeout.current) clearTimeout(blurTimeout.current);
            setShowSuggest(true);
          }}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => setShowSuggest(false), 200);
          }}
        />

        {suggest.data?.status === "ok" &&
          suggest.data.data.items.length > 0 && (
            <div
              className={`${isMobile ? "block" : "hidden"} ${
                showSuggest ? "group-hover:block focus-within:block" : "hidden"
              } z-10 absolute -left-[1px] top-full w-[calc(100%+2px)] pt-1`}
            >
              <div className="bg-background border border-secondary-background rounded-sm overflow-hidden">
                {suggest.data.data.items.map((item) => {
                  return (
                    <Link
                      to="/search/$query"
                      params={{ query: item.title }}
                      key={item.id}
                      className="text-text px-2.5 py-1.5 block hover:bg-hover"
                      onClick={onSuggestItemClick}
                    >
                      <div>{item.title}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
      </div>
      <button
        type="button"
        className="cursor-pointer w-16 border border-quaternary-background bg-quaternary-background rounded-r-sm m-0 inline-flex text-center items-center justify-center hover:bg-accent"
        onClick={onSearchClick}
      >
        <SearchIcon size={16} />
      </button>
    </div>
  );
};

const Search = forwardRef(Search_);

export { Search };
