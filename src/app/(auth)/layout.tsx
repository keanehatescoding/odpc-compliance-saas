import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <Logo />
      <div className="mt-8 w-full max-w-md">{children}</div>
    </div>
  );
}
