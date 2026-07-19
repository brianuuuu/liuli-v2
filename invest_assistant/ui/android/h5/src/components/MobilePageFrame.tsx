import type { ReactNode } from "react";

type Props = {
  navigation: ReactNode;
  children: ReactNode;
  className?: string;
};

export function MobilePageFrame({ navigation, children, className = "" }: Props) {
  return (
    <main className={`mobile-page-frame ${className}`}>
      <header className="mobile-page-frame__top">{navigation}</header>
      <div className="mobile-page-frame__content">{children}</div>
    </main>
  );
}
