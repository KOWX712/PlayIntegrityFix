export interface SpoofConfigItem {
  config: string;
  label: string;
  playStore?: boolean;
}

export interface DeviceInfo {
  model: string;
  product: string;
}

export interface PifPropMap {
  [key: string]: string | number | boolean;
}

export interface OutputLine {
  content: string;
  error: boolean;
}

export type OutputCallback = (content: string, error?: boolean) => void;
