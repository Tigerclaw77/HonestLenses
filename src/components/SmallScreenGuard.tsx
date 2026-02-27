// "use client";

// import { useEffect, useState } from "react";
// import SmallScreenOverlay from "./overlays/SmallScreenOverlay";

// const STORAGE_KEY = "hl_small_screen_ok";
// const MIN_WIDTH = 445;

// export default function SmallScreenGuard({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   const [hydrated, setHydrated] = useState(false);
//   const [show, setShow] = useState(false);

//   useEffect(() => {
//     const dismissed = sessionStorage.getItem(STORAGE_KEY) === "1";

//     function checkViewport() {
//       if (dismissed) {
//         setShow(false);
//         return;
//       }

//       setShow(window.innerWidth < MIN_WIDTH);
//     }

//     checkViewport();

//     // 👇 THIS is the fix
//     queueMicrotask(() => setHydrated(true));

//     window.addEventListener("resize", checkViewport);
//     return () => window.removeEventListener("resize", checkViewport);
//   }, []);

//   function handleContinue() {
//     sessionStorage.setItem(STORAGE_KEY, "1");
//     setShow(false);
//   }

//   if (!hydrated) return null;

//   return (
//     <>
//       {show && <SmallScreenOverlay onContinue={handleContinue} />}
//       {children}
//     </>
//   );
// }