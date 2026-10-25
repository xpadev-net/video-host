import { MoonStar, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

export const ToggleTheme = () => {
  const { theme, preference, setTheme } = useTheme();

  return (
    <Button
      size={"icon"}
      onClick={() => {
        setTheme(
          preference === "auto"
            ? "light"
            : preference === "light"
              ? "dark"
              : "auto",
        );
      }}
      variant={"ghost"}
      className="cursor-pointer"
      aria-label={
        preference === "auto"
          ? "ライトテーマに変更"
          : preference === "light"
            ? "ダークテーマに変更"
            : "システム設定に合わせる"
      }
      title={`現在のテーマ: ${preference === "auto" ? "システム設定" : theme === "dark" ? "ダーク" : "ライト"}`}
    >
      {theme === "dark" ? <MoonStar /> : <Sun />}
    </Button>
  );
};
