export type AddressSuggestion = {
  placeId: string;
  label: string;
};

export type AddressFields = {
  addressLine1: string;
  city: string;
  provinceState: string;
  postalCode: string;
  formattedAddress?: string;
};

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlace = {
  addressComponents?: GoogleAddressComponent[];
  formattedAddress?: string;
};

export function parseGoogleAddress(place: GooglePlace): AddressFields {
  const components = place.addressComponents ?? [];
  const component = (type: string) =>
    components.find((item) => item.types?.includes(type));
  const longText = (type: string) => component(type)?.longText ?? "";
  const shortText = (type: string) => component(type)?.shortText ?? longText(type);

  const streetNumber = longText("street_number");
  const route = longText("route");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ");
  const city =
    longText("locality") ||
    longText("postal_town") ||
    longText("administrative_area_level_3");
  const provinceState = shortText("administrative_area_level_1");
  const postalCode = longText("postal_code");

  return {
    addressLine1,
    city,
    provinceState,
    postalCode,
    formattedAddress:
      place.formattedAddress || formatAddress({ addressLine1, city, provinceState, postalCode }),
  };
}

export function formatAddress(address: AddressFields): string {
  const region = [address.provinceState, address.postalCode].filter(Boolean).join(" ");
  return [address.addressLine1, [address.city, region].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
}
