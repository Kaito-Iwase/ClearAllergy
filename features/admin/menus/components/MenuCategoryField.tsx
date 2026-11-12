import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { suggestMenuCategories } from "../menu-category-options";
import { MENU_TEXT_LIMITS } from "../schemas/menu-input";

export default function MenuCategoryField({ id, value, onChange, options, willUnpublish = false }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    willUnpublish?: boolean;
}) {
    const listId = useId();
    const composing = useRef(false);
    const activeOption = useRef<HTMLLIElement>(null);
    const [open, setOpen] = useState(false);
    const [hasTyped, setHasTyped] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const suggestions = open ? suggestMenuCategories(options, hasTyped ? value : "") : [];
    const expanded = suggestions.length > 0;
    const activeIndex = suggestions.indexOf(activeCategory ?? "");
    useEffect(() => {
        if (activeIndex >= 0) activeOption.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    function close() {
        setOpen(false);
        setActiveCategory(null);
    }

    function choose(category: string) {
        onChange(category);
        close();
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        // keyCode 229 also covers IMEs that report Enter after compositionend.
        if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const available = open ? suggestions : suggestMenuCategories(options, hasTyped ? value : "");
            if (available.length === 0) return;
            event.preventDefault();
            setOpen(true);
            const offset = event.key === "ArrowDown" ? 1 : -1;
            const index = activeIndex === -1 && offset === -1
                ? available.length - 1 : (activeIndex + offset + available.length) % available.length;
            setActiveCategory(available[index]);
        } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            close();
        } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (activeIndex >= 0) choose(suggestions[activeIndex]);
            else close();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
            setActiveCategory(null);
        }
    }

    return (
        <div className="min-w-0">
            <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">カテゴリ</label>
            <div className="relative">
                <input
                    id={id}
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={expanded}
                    aria-controls={expanded ? listId : undefined}
                    aria-activedescendant={activeIndex < 0 ? undefined : listId + "-" + activeIndex}
                    aria-describedby={id + "-help"}
                    autoComplete="off"
                    maxLength={MENU_TEXT_LIMITS.category}
                    value={value}
                    placeholder="例：デザート"
                    onFocus={() => { setHasTyped(false); setOpen(true); }}
                    onClick={() => setOpen(true)}
                    onBlur={() => { composing.current = false; close(); }}
                    onChange={(event) => {
                        onChange(event.target.value);
                        setHasTyped(true);
                        setOpen(true);
                        setActiveCategory(null);
                    }}
                    onCompositionStart={() => { composing.current = true; setActiveCategory(null); }}
                    onCompositionEnd={() => { composing.current = false; }}
                    onKeyDown={handleKeyDown}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                />
                {expanded && (
                    <ul id={listId} role="listbox" aria-label="カテゴリ候補"
                        className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-300 bg-white p-1 shadow-lg">
                        {suggestions.map((category, index) => (
                            <li key={category} id={listId + "-" + index} role="option" aria-selected={index === activeIndex}
                                ref={index === activeIndex ? activeOption : undefined}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(category)}
                                className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-gray-900 hover:bg-green-50 aria-selected:bg-green-100">
                                <span className="min-w-0 wrap-anywhere">{category}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <p id={id + "-help"} className="mt-1 text-xs leading-5 text-gray-600">
                候補の選択、自由入力、空欄のいずれでも保存できます。
            </p>
            <p role="status" className="text-xs font-bold leading-5 text-amber-900">
                {willUnpublish && "カテゴリを変更して保存すると公開が停止します。内容を確認して再公開してください。"}
            </p>
        </div>
    );
}
