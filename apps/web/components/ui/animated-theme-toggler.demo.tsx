import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

export default function ThemeSwitchDemo() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] transition-colors">
      <AnimatedThemeToggler />
    </div>
  );
}
