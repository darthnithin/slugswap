declare module 'expo-barcode-pdf417' {
  import type { ComponentType } from 'react';
  import type { ViewProps } from 'react-native';

  type PDF417Props = ViewProps & {
    text: string;
    width?: number;
    height?: number;
    columns?: number;
    securityLevel?: number;
    aspectRatio?: number;
    bgColor?: string;
    fgColor?: string;
  };

  const PDF417: ComponentType<PDF417Props>;
  export default PDF417;
}
