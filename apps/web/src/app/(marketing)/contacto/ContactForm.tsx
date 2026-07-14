'use client';

import { useActionState } from 'react';
import { contactAction, type ContactState } from './actions';
import styles from './contact.module.css';

const initialState: ContactState = { status: 'idle' };

export function ContactForm() {
  const [state, formAction, isPending] = useActionState<ContactState, FormData>(
    contactAction,
    initialState,
  );

  if (state.status === 'success') {
    return (
      <div className={styles.successCard} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          ✓
        </span>
        <h2 className={styles.successTitle}>Mensaje enviado</h2>
        <p className={styles.successText}>
          Gracias por escribirnos. Te responderemos pronto.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} action={formAction} noValidate>
      {state.status === 'error' && (
        <div className={styles.errorBanner} role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠</span>
          {state.message}
        </div>
      )}

      {/* Honeypot — hidden from sighted users, bots tend to fill every field */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="company">Empresa</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="name" className={styles.label}>
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Tu nombre"
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="email" className={styles.label}>
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="tu@correo.com"
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="contactType" className={styles.label}>
          Soy...
        </label>
        <select
          id="contactType"
          name="contactType"
          required
          className={styles.select}
          disabled={isPending}
          defaultValue="player"
        >
          <option value="player">Jugador</option>
          <option value="owner">Propietario de cancha</option>
          <option value="other">Otro</option>
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="message" className={styles.label}>
          Mensaje
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          maxLength={2000}
          placeholder="¿En qué te podemos ayudar?"
          className={styles.textarea}
          disabled={isPending}
        />
      </div>

      <button
        type="submit"
        className={styles.submitButton}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  );
}
