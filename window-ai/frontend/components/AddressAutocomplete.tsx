"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatAddress,
  type AddressFields,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
};

export default function AddressAutocomplete({
  value,
  onChange,
  disabled = false,
  multiline = false,
  rows = 3,
  placeholder,
  className = "",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const addressRequest = useRef<AbortController | null>(null);
  const skipAddressLookup = useRef(false);

  useEffect(() => {
    addressRequest.current?.abort();

    if (skipAddressLookup.current) {
      skipAddressLookup.current = false;
      setSuggestions([]);
      return;
    }

    const query = value.trim();
    if (!focused || disabled || query.length < 3) {
      setSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const controller = new AbortController();
    addressRequest.current = controller;
    const timeout = window.setTimeout(async () => {
      setAddressLoading(true);
      setAddressError(null);
      try {
        const response = await fetch(`/api/addresses?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Unable to look up addresses");
        setSuggestions((json.data ?? []) as AddressSuggestion[]);
      } catch (lookupError) {
        if ((lookupError as Error).name !== "AbortError") {
          setSuggestions([]);
          setAddressError((lookupError as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setAddressLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [disabled, focused, value]);

  async function selectAddress(suggestion: AddressSuggestion) {
    setAddressLoading(true);
    setAddressError(null);
    try {
      const response = await fetch(`/api/addresses?placeId=${encodeURIComponent(suggestion.placeId)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to retrieve that address");
      const address = json.data as AddressFields;
      const formatted = address.formattedAddress || formatAddress(address) || suggestion.label;
      skipAddressLookup.current = true;
      onChange(formatted);
      setSuggestions([]);
      setSelectedAddress(formatted);
    } catch (lookupError) {
      setAddressError((lookupError as Error).message);
    } finally {
      setAddressLoading(false);
    }
  }

  const inputProps = {
    className,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSelectedAddress(null);
      onChange(event.target.value);
    },
    onFocus: () => {
      setAddressError(null);
      setFocused(true);
    },
    onBlur: () => window.setTimeout(() => setFocused(false), 150),
    disabled,
    placeholder,
    autoComplete: "street-address",
    role: "combobox" as const,
    "aria-expanded": suggestions.length > 0,
    "aria-autocomplete": "list" as const,
  };

  return (
    <div className="relative">
      {multiline ? <textarea {...inputProps} rows={rows} /> : <input {...inputProps} />}
      {suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                onMouseDown={(event) => {
                  event.preventDefault();
                  void selectAddress(suggestion);
                }}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.trim().length >= 3 && addressLoading ? (
        <p className="mt-1 text-xs text-slate-500">Searching addresses...</p>
      ) : null}
      {value.trim().length >= 3 && addressError ? (
        <p className="mt-1 text-xs text-amber-700">{addressError}</p>
      ) : null}
      {selectedAddress ? (
        <p className="mt-1 text-xs text-emerald-700">Address selected: {selectedAddress}</p>
      ) : null}
    </div>
  );
}
