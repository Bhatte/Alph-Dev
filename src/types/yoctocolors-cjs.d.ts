declare module 'yoctocolors-cjs' {
  const colors: {
    bold: (text: string) => string;
    red: (text: string) => string;
    green: (text: string) => string;
    yellow: (text: string) => string;
    blue: (text: string) => string;
    magenta: (text: string) => string;
    cyan: (text: string) => string;
    white: (text: string) => string;
    gray: (text: string) => string;
    black: (text: string) => string;
    dim: (text: string) => string;
    // Add other color functions as needed
  };
  export = colors;
}
