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

  useEffect(() => {
    const trimmed = query.trim();
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
          const items = json.data.items as FilteredUser[];
          setResults(
            items.filter(
              (item) => !selected.some((user) => user.id === item.id),
            ),
          );
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
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
    <div className="user-picker" ref={containerRef}>
      {selected.length > 0 && (
        <div className="selected-users">
          {selected.map((user) => (
            <span key={user.id} className="user-chip">
              {user.name}
              <button
                type="button"
                className="chip-remove"
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
        <div className="search-results">
          {isSearching ? (
            <div className="search-status">検索中...</div>
          ) : results.length > 0 ? (
            results.map((user) => (
              <button
                key={user.id}
                type="button"
                className="search-result"
                onClick={() => handleSelect(user)}
              >
                <span className="result-name">{user.name}</span>
              </button>
            ))
          ) : (
            <div className="search-status">ユーザーが見つかりません</div>
          )}
        </div>
      )}
      <style jsx>{`
        .user-picker {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .selected-users {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .user-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: var(--background-tertiary, #252525);
          border: 1px solid var(--border-color, #333);
          border-radius: 9999px;
          color: var(--text-primary, #fff);
          font-size: 0.875rem;
        }
        .chip-remove {
          background: none;
          border: none;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0;
        }
        .chip-remove:hover {
          color: var(--text-primary, #fff);
        }
        .search-results {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 0.25rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          max-height: 240px;
          overflow-y: auto;
          z-index: 10;
        }
        .search-result {
          display: block;
          width: 100%;
          padding: 0.625rem 0.75rem;
          background: none;
          border: none;
          text-align: left;
          color: var(--text-primary, #fff);
          cursor: pointer;
        }
        .search-result:hover {
          background: var(--background-tertiary, #252525);
        }
        .result-name {
          font-size: 0.875rem;
        }
        .search-status {
          padding: 0.625rem 0.75rem;
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
};
