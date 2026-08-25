"use client";

import { useId } from "react";

export const ROOM_LOCATIONS = [
  "Bedroom",
  "Living room",
  "Family room",
  "Dining room",
  "Kitchen",
  "Hallway",
  "Bathroom",
  "Basement",
  "Office",
  "Front entrance",
  "Back entrance",
  "Side entrance",
  "Garage",
  "Sunroom",
];

export default function LocationInput({
  value,
  onChange,
  disabled,
  placeholder = "Bedroom",
  className = "",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const listId = useId();
  const missing = required && !value.trim();
  return (
    <>
      <input
        className={missing ? `${className} location-missing` : className}
        value={value}
        list={listId}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {ROOM_LOCATIONS.map((room) => <option key={room} value={room} />)}
      </datalist>
    </>
  );
}
