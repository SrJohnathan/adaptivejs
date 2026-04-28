import { File } from 'buffer';
import type { File as FormidableFile } from "formidable";
export declare function convertFile(formidableFile: FormidableFile): Promise<File>;
export declare function formDataToObject(formData: Record<string, any>): any;
export declare function normalizeFormidableFiles(obj: Record<string, any>): Promise<Record<string, any>>;
