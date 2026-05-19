### Composer controls stay editable during responses

#### Feature/Change Name
Model, skill, thinking, and plan controls remain usable while a thread turn is in progress.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A thread that can produce a long enough response to interact with the composer while the assistant is responding
3. At least one installed skill or saved prompt
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, send a message that starts an assistant response.
2. While the response is still streaming, type a follow-up draft in the composer.
3. Open the model dropdown and select a different model.
4. Open the skills dropdown and select a skill or saved prompt.
5. Open the thinking dropdown and select a different value.
6. Open the attachment menu and toggle plan mode.
7. Verify the stop button and send/queue behavior still match the in-progress turn state.
8. Switch to dark theme and repeat steps 1 through 7.

#### Expected Results
- The message textarea remains editable while the assistant is responding.
- Model, skills, thinking, and plan controls are not disabled during the in-progress response.
- Selected controls update the composer state for the next submitted or queued message.
- Stop remains available while no draft content is present, and the submit button switches to the configured steer/queue behavior when draft content exists.
- Light-theme and dark-theme controls remain readable and do not overlap.

#### Rollback/Cleanup
- Remove any disposable queued messages or test skill selections from the thread.
