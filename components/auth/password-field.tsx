"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
export function PasswordField({
  label = "Password",
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  const errorId = `${props.name}-error`;
  return (
    <label className="form-field">
      {label}
      <div className="password-input">
        <input
          {...props}
          aria-label={label}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={() => setVisible(!visible)}
        >
          <span aria-hidden>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </span>
        </button>
      </div>
      {error && (
        <span id={errorId} className="form-error">
          {error}
        </span>
      )}
    </label>
  );
}
