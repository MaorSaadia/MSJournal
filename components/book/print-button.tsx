"use client";
import { Button } from "@/components/ui/button";
export function PrintButton() { return <div className="worksheet-print-controls"><Button onClick={() => window.print()}>Print / Save as PDF</Button><p>Choose A4 or US Letter. Browser Save as PDF keeps all entered text.</p></div>; }
