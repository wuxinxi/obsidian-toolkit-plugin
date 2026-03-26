import { moment } from "obsidian";
import en from "./locales/en";
import zh from "./locales/zh";

const currentLocale = moment.locale();

const localeMap: { [k: string]: Partial<typeof en> } = {
	en,
	zh,
	"zh-cn": zh,
	"zh-hk": zh,
	"zh-tw": zh,
};

const locale = localeMap[currentLocale] || en;

export function t(str: keyof typeof en): string {
	return locale[str] || en[str];
}
