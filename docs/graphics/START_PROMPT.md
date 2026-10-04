# Start prompt for GPT-6.1 Sol

Select GPT-6.1 Sol / HIGH in the new chat before sending the following prompt. Use the isolated checkout that contains this package.

```text
Ты выполняешь отдельную задачу подготовки графики Ravenford.
Модель: GPT-6.1 Sol. Reasoning effort: HIGH.

Разрешаю только GFX00 — бриф, реестр ресурсов и перечень
решений. Это документационная подготовка; генерацию изображений
и реализацию приложения сейчас не начинай.

Прочитай:
docs/AI_CONTEXT_MAP.md
EFFORT_MATRIX.md
docs/graphics/README.md
work-orders/sol-graphics/AGENTS.md
work-orders/sol-graphics/SOL_GFX_00_BRIEF.md

Далее читай только источники, указанные в этом work order.
Соблюдай корневые инструкции и инварианты проекта.

Работай в отдельной рабочей копии с этим пакетом.
Перед началом проверь путь, ветку и незакоммиченные изменения.
Не работай в checkout Opus. Не копируй его незавершённые изменения.
Если задача открыта в checkout Opus, сначала создай отдельный
managed worktree от актуального коммита и перенеси только
проверенный пакет графики.

Используй существующие концепты как кандидаты в референсы.
Не объявляй стиль или изображение утверждённым без основания.
Если сами изображения недоступны, явно обозначь этот пробел,
составь остальные части брифа и предложи конкретный выбор.

Сохрани результаты GFX00 в design/ravenford/ по work order.
Отчёт пользователю — на русском, документация пакета — на английском.
В конце укажи файлы, выполненные проверки, открытые решения.
Не переходи к GFX10 и не меняй статусы этапов.
```

## Authorizing a later job

Use the exact work order from the index. State the one job, the authorized consuming stage, the accepted brief/reference revision, and any actual generation budget or tool constraint.

```text
Разрешаю [GFX job] из [точный work order] для разрешённого
Stage [номер]. Используй принятый бриф [путь/ревизия].
Выполни только этот job, сохрани ресурсы и проверяемый handoff.
Код приложения и основную ветку не меняй.
После завершения остановись на границе job.
```

Replace the bracketed values; they are not approvals or verified stage status. If the owner already selected references or gave a budget in the current session, use that decision instead of asking again.
