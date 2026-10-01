import type { ReactNode } from "react";

type props = {
  children?: ReactNode;
  checked: boolean;
};

const Switch = ({ children, checked }: props) => {
  return (
    <span
      aria-hidden="true"
      className="group relative w-[30px] h-[10px] rounded-[6px] bg-white/20 border-0 cursor-pointer data-[state=checked]:bg-[var(--color-accent)]"
      data-state={checked ? "checked" : "unchecked"}
    >
      <span className="block w-[17px] h-[17px] absolute rounded-full left-[8px] top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-100 bg-[#bdbdbd] group-data-[state=checked]:left-[22px] group-data-[state=checked]:bg-white">
        {children}
      </span>
    </span>
  );
};

export { Switch };
