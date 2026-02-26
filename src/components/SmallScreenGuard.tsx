"use client";

import { useEffect, useState } from "react";
import SmallScreenOverlay from "./overlays/SmallScreenOverlay";

export default function SmallScreenGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("hl_small_screen_ok") === "1") return;

    function check() {
      setShow(window.innerWidth < 445);
    }

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function handleContinue() {
    localStorage.setItem("hl_small_screen_ok", "1");
    setShow(false);
  }

  return (
    <>
      {show && <SmallScreenOverlay onContinue={handleContinue} />}
      {children}
    </>
  );
}