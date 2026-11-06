import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
export function IconButton({
  label,
  children,
  onClick,
  className = "",
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Modal({
  children,
  onClose,
  title,
  full = false,
  back = false,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  full?: boolean;
  back?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closer = useRef(onClose);
  closer.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={
        full ? "mobile-dialog full-dialog" : "mobile-dialog sheet-dialog"
      }
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closer.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) closer.current();
      }}
    >
      <div className={full ? "full-dialog-content" : "sheet-content"}>
        {!full && (
          <>
            <div className="sheet-handle" />
            <div className="sheet-title">
              {back && (
                <IconButton label="返回偏好设置" onClick={onClose}>
                  <ArrowLeft />
                </IconButton>
              )}
              <h2>{title}</h2>
              {!back && (
                <IconButton label="关闭面板" onClick={onClose}>
                  <X />
                </IconButton>
              )}
            </div>
          </>
        )}
        {children}
      </div>
    </dialog>
  );
}

export function Toast({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.showPopover();
  }, [text]);
  return (
    <div ref={ref} popover="manual" className="mobile-toast" role="status">
      {text}
    </div>
  );
}
