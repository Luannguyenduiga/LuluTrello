import React, { useCallback, useEffect, useState } from 'react';

/**
 * Flip this to false the moment email delivery works again - it is the single
 * switch for the notice, so nobody has to hunt through the pages that use it.
 *
 * Background: Brevo disabled the account's sending platform. Its API still
 * answers 2xx for every send and drops the mail afterwards, so the server
 * cannot tell that verification codes are going nowhere. GitHub OAuth is
 * unaffected, which is why the notice points people there.
 */
export const EMAIL_AUTH_MAINTENANCE = true;

/** Dismissal lives for the tab, not forever: a new visit should see it again. */
const DISMISS_KEY = 'lulu.emailMaintenanceDismissed';

/**
 * Real files, real line numbers. Three frames without column numbers - a
 * longer frame would wrap into nonsense on a narrow phone.
 */
// const TRACE = [
//   ['MailService.deliver', 'mail.service.ts:197'],
//   ['AuthService.sendCode', 'auth.service.ts:64'],
//   ['AuthController.sendCode', 'auth.controller.ts:24'],
// ];

/** sessionStorage throws outright in some privacy modes, so every access is guarded. */
const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

const rememberDismissal = () => {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Not being able to remember is fine - the notice simply shows again.
  }
};

/**
 * A maintenance notice dressed as a console error, because the audience is
 * developers. Opens centred over the page on arrival; closing it leaves the
 * page exactly as it would have been.
 */
export default function MaintenanceNotice() {
  const [open, setOpen] = useState(() => EMAIL_AUTH_MAINTENANCE && !wasDismissed());

  const close = useCallback(() => {
    setOpen(false);
    rememberDismissal();
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    // Hold the page still underneath, then hand back whatever was there before
    // rather than assuming it was the default.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  // .modal-overlay is the app's existing dialog backdrop, the same one
  // TaskModal uses - backdrop click to close, stopPropagation inside.
  return (
    <div
      className="modal-overlay"
      onClick={close}
      role="presentation"
    >
      <div
        className="devnotice"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="devnotice-heading"
        /* The backdrop closes on click; clicks inside the window must not. */
        onClick={(event) => event.stopPropagation()}
      >
        <div className="devnotice-bar">
          <span className="devnotice-dot devnotice-dot--red" />
          <span className="devnotice-dot devnotice-dot--amber" />
          <span className="devnotice-dot devnotice-dot--green" />
          <span className="devnotice-title">auth-service — bash — 80×24</span>
          <button
            type="button"
            className="devnotice-close"
            onClick={close}
            aria-label="Đóng thông báo"
            autoFocus
          >
            ✕
          </button>
        </div>

        <div className="devnotice-body">
          <div className="devnotice-line">
            <span className="devnotice-prompt">$</span>{' '}
            <span className="devnotice-cmd">curl -X POST /auth/send-code</span>
          </div>

          {/* The code sits on its own line by design - together they overflow
              a phone-width window, and a wrapped header reads as a bug. */}
          <div className="devnotice-err" id="devnotice-heading">
            <div className="devnotice-line">
              <span className="devnotice-mark">✕</span> ServiceUnavailableError: 503
            </div>
            <div className="devnotice-line">
              <span className="devnotice-code">EMAIL_AUTH_UNDER_MAINTENANCE</span>
            </div>
          </div>

          <div className="devnotice-msg">Đăng nhập bằng Email đang bảo trì.</div>

          {/* <div className="devnotice-trace">
            {TRACE.map(([fn, loc]) => (
              <div className="devnotice-frame" key={loc}>
                <span className="devnotice-dim">at</span> {fn}{' '}
                <span className="devnotice-dim">({loc})</span>
              </div>
            ))}
          </div> */}

          <div className="devnotice-fix">
            <span className="devnotice-ok">✔</span> Các đồng coder hãy đăng nhập bằng GitHub nhé!
          </div>

          <div className="devnotice-line devnotice-dim">
            github oauth: operational
            <span className="devnotice-caret" />
          </div>

          <button type="button" className="devnotice-dismiss primary" onClick={close}>
            Đã hiểu, đóng lại
          </button>
        </div>
      </div>
    </div>
  );
}
