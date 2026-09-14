import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "small" | "medium";
}>(function Button({
  variant = "secondary",
  size = "medium",
  className = "",
  type = "button",
  ...props
}, ref) {
  return (
    <button
      className={`ui-button ui-button--${variant}${size === "small" ? " ui-button--small" : ""} ${className}`.trim()}
      ref={ref}
      type={type}
      {...props}
    />
  );
});

export function FieldFrame({
  label,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string; children: ReactNode }) {
  return (
    <div className={`ui-field ${className}`.trim()} role="group" aria-label={props["aria-labelledby"] ? undefined : label} {...props}>
      {children}
    </div>
  );
}

export const Surface = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function Surface(
  { className = "", ...props },
  ref,
) {
  return <section className={`ui-surface ${className}`.trim()} ref={ref} {...props} />;
});

export function Disclosure({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`ui-disclosure ${className}`.trim()}>
      <summary>{label}</summary>
      {children}
    </details>
  );
}

export function Feedback({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error";
  children: ReactNode;
}) {
  return (
    <p className={`ui-feedback ui-feedback--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
