import type { Metadata } from 'next';
import { SportBackground } from '@/components/SportBackground';
import { ContactForm } from './ContactForm';
import styles from './contact.module.css';

export const metadata: Metadata = {
  title: 'Contacto — cancha.',
  description:
    'Escríbenos tus preguntas sobre cancha., para jugadores o propietarios de canchas en Ecuador.',
};

export default function ContactPage() {
  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <SportBackground />
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>Contacto</span>
          <h1 className={styles.heading}>Hablemos</h1>
          <p className={styles.subheading}>
            ¿Tienes dudas, sugerencias o quieres registrar tu cancha? Escríbenos.
          </p>
        </div>
      </div>

      <section className={styles.formSection}>
        <ContactForm />
      </section>
    </main>
  );
}
