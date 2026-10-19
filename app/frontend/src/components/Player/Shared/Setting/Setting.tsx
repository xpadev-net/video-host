import { useAtom, useAtomValue } from "jotai";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  PlayerSettingAtom,
  PlayerStateAtom,
  WrapperRefAtom,
} from "@/atoms/Player";
import { GenericPage } from "@/components/Player/Shared/Setting/pages/GenericPage";
import { useSettingDefinitions } from "@/components/Player/Shared/Setting/settingDefinitions";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/libraries/isMobile";

type Props = {
  className?: string;
};

export type MenuProps = {
  className?: string;
  updateScale?: (ref: HTMLDivElement) => void;
};

const Setting = ({ className }: Props) => {
  const [state, setState] = useAtom(PlayerStateAtom);
  const [size, setSize] = useState({
    width: 0,
    height: 0,
    maxHeight: 0,
    left: 0,
  });
  const playerSetting = useAtomValue(PlayerSettingAtom);
  const wrapperRef = useAtomValue(WrapperRefAtom);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const previousOpen = useRef(false);
  const isMobile = useIsMobile();
  const settingDefinitions = useSettingDefinitions();
  useEffect(() => {
    const onClick = () => {
      setState((pv) => ({
        ...pv,
        isSetting: false,
      }));
    };
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("click", onClick);
    };
  }, [setState]);

  const updateScale = useMemo<(ref: HTMLDivElement) => void>(() => {
    return (ref: HTMLDivElement) => {
      if (!wrapperRef) return;
      const width = ref.clientWidth,
        height = ref.clientHeight,
        left = ref.offsetLeft;
      setSize((pv) => ({
        ...pv,
        width,
        height,
        left,
        maxHeight: wrapperRef.clientHeight - 120,
      }));
    };
  }, [wrapperRef]);

  useEffect(() => {
    if (!wrapperRef) return;
    const handler: ResizeObserverCallback = (entries) => {
      const wrapper = entries[0];
      if (!wrapper) return;
      setSize((pv) => ({
        ...pv,
        maxHeight: wrapper.contentRect.height - 120,
      }));
    };
    const resizeObserver = new ResizeObserver(handler);
    resizeObserver.observe(wrapperRef);
    return () => {
      resizeObserver.disconnect();
    };
  }, [wrapperRef]);

  const onClick = (e: MouseEvent<HTMLFieldSetElement>) => {
    e.stopPropagation();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setState((pv) => ({ ...pv, isSetting: false }));
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('[aria-controls="player-settings-menu"]')
          ?.focus();
      });
      return;
    }
    if (e.key === "Tab" && scrollContainerRef.current) {
      const focusable = Array.from(
        scrollContainerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.closest('[aria-hidden="true"]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first && last && e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (last && !e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    e.stopPropagation();
  };

  useEffect(() => {
    if (state.isSetting && !previousOpen.current) {
      requestAnimationFrame(() => {
        scrollContainerRef.current
          ?.querySelector<HTMLElement>("button")
          ?.focus();
      });
    }
    previousOpen.current = state.isSetting;
  }, [state.isSetting]);

  useEffect(() => {
    if (!state.isSetting || !playerSetting.length) return;
    requestAnimationFrame(() => {
      scrollContainerRef.current
        ?.querySelector<HTMLElement>('[aria-hidden="false"] button')
        ?.focus();
    });
  }, [playerSetting, state.isSetting]);

  return (
    <div
      ref={scrollContainerRef}
      id="player-settings-menu"
      role="dialog"
      aria-label="プレイヤー設定"
      aria-modal="true"
      aria-hidden={!state.isSetting}
      inert={!state.isSetting}
      className={cn(
        "overflow-y-scroll bg-black/80 rounded-[5px]",
        !state.isSetting && "opacity-0 select-none pointer-events-none",
        className,
      )}
      style={{
        maxHeight: isMobile ? "unset" : `${size.maxHeight}px`,
      }}
    >
      <fieldset
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="overflow-hidden transition-[width,height] duration-200 ease-in-out relative block min-w-0 border-0 p-0"
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
      >
        <div
          className="w-[1920px] h-[1080px] flex items-start absolute top-0 transition-[left] duration-200"
          style={{
            left: `-${size.left}px`,
          }}
        >
          {playerSetting.map((key, index) => {
            const config = settingDefinitions[key];
            if (!config) return null;
            if (index + 1 === playerSetting.length) {
              return (
                <GenericPage
                  key={key}
                  config={config}
                  isActive={index === playerSetting.length - 1}
                  updateScale={updateScale}
                />
              );
            }
            return (
              <GenericPage
                key={key}
                config={config}
                isActive={index === playerSetting.length - 1}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
};

export { Setting };
