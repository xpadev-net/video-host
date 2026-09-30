import type { FilteredUser } from "@video-host/backend";
import { type FC, useEffect, useRef, useState } from "react";
import { client } from "@/lib/client";

type Props = {
  selected: FilteredUser[];
  onChange: (users: FilteredUser[]) => void;
  id?: string;
};

export const UserPicker: FC<Props> = ({ selected, onChange, id }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilteredUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++latestRequestId.current;
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

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
        }
      } catch {
        if (requestId === latestRequestId.current) {
          setResults([]);
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
              {user.name}
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
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder="ユーザー名で検索して追加"
      />
      {isFocused && query.trim() && (
        <div className="bg-background border-border absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border">
          {isSearching ? (
            <div className="text-sub-text px-3 py-2.5 text-sm">検索中...</div>
          ) : results.length > 0 ? (
            results.map((user) => (
              <button
                key={user.id}
                type="button"
                className="text-text hover:bg-thirdly-background block w-full cursor-pointer px-3 py-2.5 text-left"
                onClick={() => handleSelect(user)}
              >
                <span className="text-sm">{user.name}</span>
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
