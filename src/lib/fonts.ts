import { Instrument_Sans, Spectral } from "next/font/google"

/** Text and interface. */
export const fontSans = Instrument_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-sans", display: "swap" })

/** Headlines and figures: fine, light serif. */
export const fontDisplay = Spectral({ subsets: ["latin"], weight: ["300", "400"], style: ["normal", "italic"], variable: "--font-display", display: "swap" })
