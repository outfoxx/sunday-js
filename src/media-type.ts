export enum MediaType {
  JSON = 'application/json',
  YAML = 'application/yaml',
  CBOR = 'application/cbor',
  OCTET_STREAM = 'application/octet-stream',
  EVENT_STREAM = 'text/event-stream',
  X509_CA_CERT = 'application/x-x509-ca-cert',
  WWW_URL_FORM_ENCODED = 'application/x-www-form-urlencoded',
  PROBLEM_JSON = 'application/problem+json',
}

export function mediaType(value: string | null | undefined): string | undefined;
export function mediaType(
  value: string | null | undefined,
  def: string
): string;

export function mediaType(
  value: string | null | undefined,
  def?: string
): string | undefined {
  return value?.split(';')[0].trim() ?? def;
}
