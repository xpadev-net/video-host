import { useSetAtom } from "jotai";
import { LogIn, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { AuthTokenAtom } from "@/atoms/Auth";
import { Button } from "@/components/ui/button";
import { useSelf } from "@/hooks/useUser";
import { deleteAuth } from "@/service/deleteAuth";
import { getUserData } from "@/utils/userResponse";

const AuthButton = () => {
  const { data: response } = useSelf();
  const router = useRouter();
  const pathname = usePathname();
  const setAuthToken = useSetAtom(AuthTokenAtom);
  const user = getUserData(response);

  if (user) {
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
        const callback = encodeURIComponent(pathname || "/");
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
