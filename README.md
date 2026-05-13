# liuli

`liuli` is a personal investment assistant system. The backend follows `docs/liuli_system_spec_v6.md`.

## Phase 1 Backend

Run API:

```powershell
uvicorn invest_assistant.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Run worker:

```powershell
python -m invest_assistant.worker
```

Run tests:

```powershell
pytest
```

## Frontend Boundary

The existing Web and Android technology stacks are not migrated in this rewrite. Backend implementation follows the spec strictly; Web and Android will adapt to the new API later.
