import { File } from "buffer";
import fss from "fs";
import fs from "fs/promises";
export async function convertFile(formidableFile) {
	const fileBuffer = await fs.readFile(formidableFile.filepath);
	return new File([fileBuffer], formidableFile.originalFilename || "file", {
		type: formidableFile.mimetype || "application/octet-stream",
		lastModified: Date.now()
	});
}
function getFileName(filePath) {
	return new Promise((resolve, reject) => {
		fss.readFile(filePath, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}
export function formDataToObject(formData) {
	const result = {};
	for (const fullKey in formData) {
		const value = formData[fullKey];
		const keys = fullKey.split(/\[|\]/g).filter(Boolean);
		keys.reduce((acc, key, idx) => {
			const isLast = idx === keys.length - 1;
			if (isLast) {
				if (acc[key] !== undefined) {
					// Evita transformar File em array ou sobrescrevê-lo
					if (acc[key] instanceof File || value instanceof File) {
						// Já existe um File ou novo valor é um File? Não transforma!
						return acc;
					}
					// Se já existe e não é array, transforma em array
					if (!Array.isArray(acc[key])) {
						acc[key] = [acc[key]];
					}
					acc[key].push(value);
				} else {
					acc[key] = value;
				}
			} else {
				if (!acc[key] || typeof acc[key] !== "object" || acc[key] instanceof File) {
					acc[key] = {};
				}
			}
			return acc[key];
		}, result);
	}
	// Pós-processamento: transformar arrays de 1 item em valor simples (mas não em File)
	function simplify(obj) {
		if (Array.isArray(obj)) {
			return obj.length === 1 ? simplify(obj[0]) : obj.map(simplify);
		} else if (typeof obj === "object" && obj !== null && !(obj instanceof File)) {
			for (const key in obj) {
				obj[key] = simplify(obj[key]);
			}
		}
		return obj;
	}
	return simplify(result);
}
export async function normalizeFormidableFiles(obj) {
	const result = {};
	for (const key in obj) {
		const value = obj[key];
		if (Array.isArray(value)) {
			// Pode ser array de arquivos, campos, ou misto
			result[key] = await Promise.all(value.map((item) => isFileObject(item) ? convertFile(item) : item));
		} else if (isFileObject(value)) {
			result[key] = await convertFile(value);
		} else {
			result[key] = value;
		}
	}
	return result;
	function isFileObject(file) {
		return file && typeof file === "object" && "filepath" in file && "originalFilename" in file && "mimetype" in file;
	}
}

//# sourceMappingURL=convertFile.js.map
