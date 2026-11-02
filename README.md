# sn-plugin-budget

Плагін-редактор «Budget» для [Standard Notes](https://standardnotes.com/): борги, накопичення, щомісячні надходження й витрати, план місяця. Мультивалютність без автоматичного перерахунку — сума у валюті плюс введена вручну сума в грн.

Дані зберігаються в нотатці **звичайним Markdown**, тож вона читається і без плагіна.

**Статус:** версія 1.0 — етапи 0–4 з `docs/SPEC.md` реалізовано; ручні перевірки в Standard Notes — за власником. Встановлення й оновлення — [`docs/INSTALL.md`](docs/INSTALL.md), зразок нотатки — [`docs/SAMPLE.md`](docs/SAMPLE.md).

- Технічне завдання: [`docs/SPEC.md`](docs/SPEC.md)
- Правила для Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Нотатки з безпеки: [`docs/SECURITY-NOTES.md`](docs/SECURITY-NOTES.md)

## Приватність

Плагін не робить жодних мережевих запитів, не використовує сховища браузера і не логує вміст нотатки. Деталі — `docs/SPEC.md`, розділ 7.

## Ліцензія

[AGPL-3.0-only](LICENSE): її вимагає вбудована бібліотека `@standardnotes/component-relay` (див. [`docs/SECURITY-NOTES.md`](docs/SECURITY-NOTES.md)).

## Повідомити про вразливість

Не відкривайте публічний issue — скористайтесь [приватним повідомленням про вразливість](https://github.com/alstdev/sn-plugin-budget/security/advisories/new) у вкладці Security.
