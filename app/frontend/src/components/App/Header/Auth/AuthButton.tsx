import { useSetAtom } from "jotai";
import { LogIn, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { AuthTokenAtom } from "@/atoms/Auth";
import { Button } from "@/components/ui/button";
import { useSelf } from "@/hooks/useUser";
import { deleteAuth } from "@/service/deleteAuth";

const AuthButton = () => {
  const user = useSelf();
  const router = useRouter();
  const pathname = usePathname();
  const setAuthToken = useSetAtom(AuthTokenAtom);

  // biome-ignore lint/suspicious/noExplicitAny: type inference
  if (user.data?.status === "ok" && (user.data as any).data) {
    return (
      <Button
        size={"icon"}
        variant={"ghost"}
        onClick={() => {
          void deleteAuth().then(() => {
            setAuthToken(null);
            location.reload();
          });
        }}
        className="cursor-pointer"
      >
        <LogOut />
      </Button>
    );
  }
  return (
    <Button
      variant={"ghost"}
      onClick={() => {
        const callback = encodeURIComponent(pathname);
        void router.push(`/login?callback=${callback}`);
      }}
      size={"icon"}
      className="cursor-pointer"
    >
      <LogIn />
    </Button>
  );
};

export { AuthButton };
