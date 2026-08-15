"use client";

import { useEffect, useRef, useState } from "react";

import {
  SAVE_CART_EXIT_INTENT_SESSION_KEY,
  shouldShowSaveCartExitIntent,
} from "@/lib/saveCartExitIntent";

import SaveCartForm from "./SaveCartForm";
import styles from "./conversion.module.css";

type ExitIntentSaveCartProps = {
  cartId: string;
  cartHasItems: boolean;
  checkoutStarted: boolean;
};

function supportsDesktopExitIntent() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function ExitIntentSaveCart({
  cartId,
  cartHasItems,
  checkoutStarted,
}: ExitIntentSaveCartProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const promptSeenRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  function suppressPrompt() {
    sessionStorage.setItem(SAVE_CART_EXIT_INTENT_SESSION_KEY, "1");
    promptSeenRef.current = true;
  }

  function dismissPrompt() {
    suppressPrompt();
    setIsOpen(false);
  }

  useEffect(() => {
    startedAtRef.current = Date.now();

    if (!supportsDesktopExitIntent()) return;

    promptSeenRef.current =
      sessionStorage.getItem(SAVE_CART_EXIT_INTENT_SESSION_KEY) === "1";
  }, []);

  useEffect(() => {
    if (!supportsDesktopExitIntent() || !cartHasItems || checkoutStarted) return;

    function handleMouseOut(event: MouseEvent) {
      const eligible = shouldShowSaveCartExitIntent({
        cartHasItems,
        checkoutStarted,
        elapsedMs: Date.now() - (startedAtRef.current ?? Date.now()),
        promptAlreadySeen: promptSeenRef.current,
        relatedTargetIsNull: event.relatedTarget === null,
        pointerExitedAboveViewport: event.clientY <= 0,
      });

      if (!eligible) return;

      activeElementRef.current = document.activeElement as HTMLElement | null;
      suppressPrompt();
      setIsOpen(true);
    }

    document.addEventListener("mouseout", handleMouseOut);
    return () => document.removeEventListener("mouseout", handleMouseOut);
  }, [cartHasItems, checkoutStarted]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => {
        dialog.querySelector<HTMLInputElement>("input")?.focus();
      }, 0);
      return;
    }

    if (!isOpen && dialog.open) {
      dialog.close();
      activeElementRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isSaved) return;
    dialogRef.current
      ?.querySelector<HTMLElement>("[data-save-cart-saved-heading]")
      ?.focus();
  }, [isOpen, isSaved]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.saveCartDialog}
      aria-labelledby="save-cart-exit-title"
      onCancel={(event) => {
        event.preventDefault();
        dismissPrompt();
      }}
    >
      <button
        className={styles.saveCartDialogClose}
        type="button"
        aria-label="Close save cart prompt"
        onClick={dismissPrompt}
      >
        ×
      </button>
      {isSaved ? (
        <div className={styles.saveCartSaved}>
          <h2
            id="save-cart-exit-title"
            tabIndex={-1}
            data-save-cart-saved-heading
          >
            Your cart is saved
          </h2>
          <p>Check your email for a secure link to return to your cart.</p>
          <button type="button" onClick={dismissPrompt}>
            Continue shopping
          </button>
        </div>
      ) : (
        <SaveCartForm
          cartId={cartId}
          rescue
          autoFocus
          headingId="save-cart-exit-title"
          onSaved={() => {
            suppressPrompt();
            setIsSaved(true);
          }}
        />
      )}
    </dialog>
  );
}
