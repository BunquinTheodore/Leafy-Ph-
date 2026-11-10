# Test cases and results

The test case list from the final project documentation (section 9.4, updated list). Every case has
a test that carries its ID as `@pytest.mark.tc("TC-0xx")` (API) or is named in the table (browser).

Check all of them with one command from `api/`:

```
.venv\Scripts\python.exe -m pytest -m tc --no-cov
```

The end of the run prints one `PASS` or `FAIL` line per test case. Browser cases run on the full
stack (`scripts\dev\run-all.ps1 -E2E`, then `pnpm test:e2e:full` from `app/`).

## Results

| Test ID | Feature | Test description | Expected result | Actual result | Status |
|---|---|---|---|---|---|
| TC-001 | F-01 | Sign in with valid email and password. | The user is authenticated and receives a session. | Login returned 200 with an access token that opens `/users/me`, and one refresh token row was stored. | Pass |
| TC-002 | F-01 | Sign in with an incorrect password. | The system rejects the credentials and issues no session. | Returned 401 `invalid_credentials` with no tokens in the body and no new refresh token row. The reply is identical for an unknown email. | Pass |
| TC-003 | F-01 | Refresh a session, then reuse the previous refresh token outside the grace period. | The valid refresh rotates the token. Reuse outside the grace period revokes the token family. | Refresh rotated the token. Reuse inside the grace period returned an access token only. Reuse after it returned 401 `refresh_reuse_detected` and every token in the family was revoked. | Pass |
| TC-004 | F-02 | Set a new password after a recent Google sign in. | The account holder can set a new password without entering the current password. | A fresh Google session set a new password with no current password. The new password signs in and the old one does not. A stale session still needs the current password. | Pass |
| TC-005 | F-02 | Delete an account that owns scans. | The account and its scan records are removed. The associated photos are queued for deletion. | The user and all their scans were removed, another member's scan was untouched, and with storage down the queue held exactly the deleted scans' image keys until the purge removed them. | Pass |
| TC-006 | F-03 | Open a plant and one of its disease entries in the public handbook. | The requested plant and disease details are available without signing in. | The API returned the plant and disease with symptoms and treatments and no credentials. In a browser with no cookies, `/handbook/tomato` and a disease page opened with status 200 and no redirect to sign in. | Pass |
| TC-007 | F-04 | Upload a valid leaf photo and check its processing status. | The upload returns 202 Accepted. The scan progresses to a completed result. | The upload returned 202 and the worker moved the scan through its stages to completed with the scripted classifier. | Pass |
| TC-008 | F-04 | Upload an unsupported file or an invalid image. | The API returns 415 for an unsupported format and 422 for an invalid image. | 415 and 422 were returned with their error codes and nothing was stored. | Pass |
| TC-009 | F-05 | View the result of a scan whose predicted plant is absent from the catalog. | The scan result shows an Unknown verdict without a linked plant. | The scan completed with an Unknown verdict and no linked plant. | Pass |
| TC-010 | F-04 | Check inference timeout and stale-worker handling after a retry. | A timed-out attempt fails. An older worker cannot overwrite a newer attempt. | A timed-out attempt failed with `prediction_failed`. A stale worker could not change a retried run. | Pass |
| TC-011 | F-06 | Attempt to open or delete another member's scan through the browser workflow. | The system denies access and preserves the owner's scan. | In the browser the second member got a 404 page and 404 on the API routes. The owner's scan stayed available. | Pass |
| TC-012 | F-06 | Request personal dashboard statistics when the account has completed and unfinished scans. | The dashboard statistics count only the signed-in member's completed scans. | Statistics counted completed scans of the signed-in member only. | Pass |
| TC-013 | F-05 | Submit correction feedback for a completed scan. | The system validates and saves feedback against the completed scan. | Valid feedback was saved and updated on a completed scan. Invalid bodies returned 422. | Pass |
| TC-014 | F-05 | Remove previously submitted feedback from an owned scan. | The system removes the feedback and keeps the scan record. | Deleting returned success, the scan still loaded with no feedback, and deleting again was harmless. | Pass |
| TC-015 | F-04 | Submit a valid photo without signing in. | The API returns 401 Unauthorized. | The API returned 401. | Pass |
| TC-016 | F-04 | Submit a scan request without the required image field. | The API returns 422 Unprocessable Entity. | The API returned 422. | Pass |
| TC-017 | F-04 | Upload a photo that exceeds the configured file-size limit. | The API returns 413 Payload Too Large. | The API returned 413 `payload_too_large`. | Pass |
| TC-018 | F-04 | Retry a scan that already completed successfully. | The API returns 409 Conflict because retry is available only for failed scans. | The API returned 409 `scan_not_failed`. | Pass |
| TC-019 | F-05 | Request another member's scan result directly through the API. | The API returns 404 Not Found without exposing the scan details. | The API returned 404, identical to the reply for a scan that does not exist, with no scan details in the body. | Pass |
| TC-020 | F-05 | Submit feedback for a scan that is still processing. | The system rejects the feedback because the scan has yet to complete. | The API returned 409 `scan_not_completed`. | Pass |

## Where each test lives

| Test ID | Tests |
|---|---|
| TC-001 | `api/tests/integration/test_auth_api.py` (`test_login_success_and_me`, `test_valid_login_issues_a_stored_session`) |
| TC-002 | `test_auth_api.py` (`test_login_failures_are_uniform_invalid_credentials`, `test_wrong_password_issues_no_session`) |
| TC-003 | `test_auth_api.py` (`test_refresh_rotation_grace_and_reuse_detection`), `test_token_service.py` (`test_reuse_after_grace_revokes_family_and_the_revocation_persists`) |
| TC-004 | `accounts_catalog/test_password_recovery.py` |
| TC-005 | `accounts_catalog/test_account_api.py` (delete and storage outage tests) |
| TC-006 | `accounts_catalog/test_catalog_api.py` (signed out test), `app/e2e/full/handbook-public.spec.ts` |
| TC-007 to TC-010 | `scans/test_create_and_process.py`, `scans/test_worker_isolation.py` |
| TC-011 | `scans/test_create_and_process.py` (`test_other_users_get_404`), `app/e2e/full/ownership.spec.ts` |
| TC-012 | `scans/test_list_stats_manage.py` (`test_stats_counts_completed_only`) |
| TC-013, TC-014, TC-020 | `scans/test_feedback_janitor_export.py` |
| TC-015 to TC-017 | `scans/test_create_and_process.py` |
| TC-018 | `scans/test_list_stats_manage.py` (`test_retry_only_for_failed_scans`) |
| TC-019 | `scans/test_create_and_process.py` (`test_other_users_get_404`, `test_another_members_scan_is_indistinguishable_from_a_missing_one`) |

The seed loader tests (run twice, nothing duplicated) are not in the updated list. They stay in the
suite and report as `SEED-01`.
