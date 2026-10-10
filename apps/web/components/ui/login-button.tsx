"use client";

export default function LoginButton() {
  return (
    <a
      href="/giris"
      className="bar__link"
      onClick={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        window.dispatchEvent(
          new CustomEvent("apex:open-login", {
            detail: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
          }),
        );
      }}
    >
      Log in
    </a>
  );
}
