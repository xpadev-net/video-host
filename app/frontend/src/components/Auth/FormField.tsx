import { Input } from "@/components/ui/input";

interface FormFieldProps {
  type: "text" | "password" | "email";
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
}

export function FormField({
  type,
  placeholder,
  value,
  onChange,
  disabled = false,
  required = false,
  autoComplete,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Input
        type={type}
        aria-label={placeholder}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      />
    </div>
  );
}
