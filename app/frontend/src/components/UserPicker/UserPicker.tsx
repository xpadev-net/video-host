import type { FilteredUser } from "@video-host/backend";
import { type FC, useEffect, useId, useRef, useState } from "react";
import { client } from "@/lib/client";

type Props = {
  selected: FilteredUser[];
  onChange: (users: FilteredUser[]) => void;
  id?: string;
};

export const UserPicker: FC<Props> = ({ selected, onChange, id }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilteredUser[]>([]);
  const [resultsForQuery, setResultsForQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRequestId = useRef(0);
  const pickerId = useId();
  const listboxId = `${pickerId}-users`;
  const showOptions = isFocused && query.trim().length > 0;
  const currentResults = resultsForQuery === query.trim() ? results : [];
  const isCurrentQueryPending =
    showOptions && (isSearching || resultsForQuery !== query.trim());

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++latestRequestId.current;
    if (!trimmed) {
      setResults([]);
      setResultsForQuery("");
      setIsSearching(false);
      return;
    }

    setResults([]);
    setResultsForQuery("");
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await client.api.v4.users.$get({
          query: { query: trimmed, limit: "10" },
        });
        if (res.ok) {
          const json = await res.json();
          if (requestId !== latestRequestId.current) return;
          const items = json.data.items as FilteredUser[];
          setResults(
            items.filter(
              (item) => !selected.some((user) => user.id === item.id),
            ),
          );
          setResultsForQuery(trimmed);
        } else if (requestId === latestRequestId.current) {
          setResults([]);
          setResultsForQuery(trimmed);
        }
      } catch {
        if (requestId === latestRequestId.current) {
          setResults([]);
          setResultsForQuery(trimmed);
        }
      } finally {
        if (requestId === latestRequestId.current) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selected]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (user: FilteredUser) => {
    onChange([...selected, user]);
    setQuery("");
    setResults([]);
    setResultsForQuery("");
    setActiveIndex(0);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && currentResults.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, currentResults.length - 1));
    } else if (event.key === "ArrowUp" && currentResults.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (
      event.key === "Enter" &&
      showOptions &&
      !isCurrentQueryPending &&
      currentResults[activeIndex]
    ) {
      event.preventDefault();
      handleSelect(currentResults[activeIndex]);
    } else if (event.key === "Escape") {
      setIsFocused(false);
      setActiveIndex(0);
    }
  };

  const handleRemove = (userId: string) => {
    onChange(selected.filter((user) => user.id !== userId));
  };

  return (
    <div className="relative flex flex-col gap-2" ref={containerRef}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((user) => (
            <span
              key={user.id}
              className="bg-thirdly-background border-border text-text inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
            >
              {user.name}{" "}
              <span className="text-sub-text">@{user.username}</span>
              <button
                type="button"
                className="text-sub-text hover:text-text cursor-pointer text-base leading-none"
                onClick={() => handleRemove(user.id)}
                aria-label={`${user.name}を削除`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleInputKeyDown}
        role="combobox"
        aria-label="ユーザー名で検索して追加"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showOptions}
        aria-controls={listboxId}
        aria-activedescendant={
          showOptions && currentResults[activeIndex]
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
        placeholder="ユーザー名で検索して追加"
      />
      {showOptions && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="ユーザー検索結果"
          className="bg-background border-border absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border"
        >
          {isCurrentQueryPending ? (
            <div className="text-sub-text px-3 py-2.5 text-sm" role="status">
              検索中...
            </div>
          ) : currentResults.length > 0 ? (
            currentResults.map((user, index) => (
              <button
                id={`${listboxId}-option-${index}`}
                key={user.id}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index === activeIndex}
                className={`text-text hover:bg-thirdly-background block w-full cursor-pointer px-3 py-2.5 text-left ${index === activeIndex ? "bg-thirdly-background" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => handleSelect(user)}
              >
                <span className="text-sm">
                  {user.name}{" "}
                  <span className="text-sub-text">@{user.username}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="text-sub-text px-3 py-2.5 text-sm">
              ユーザーが見つかりません
            </div>
          )}
        </div>
      )}
    </div>
  );
};
