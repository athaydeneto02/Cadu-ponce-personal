/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Workout } from '../types';

/**
 * Generates and downloads a high-quality PDF of the given workout.
 */
export function generateWorkoutPDF(workout: Workout, studentName?: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Helper to check page overflow and add a new page
  const checkPageOverflow = (heightNeeded: number) => {
    if (y + heightNeeded > pageHeight - 20) {
      doc.addPage();
      y = 20;
      drawHeaderAndFooter(true); // draw a mini header on subsequent pages
    }
  };

  const drawHeaderAndFooter = (isSubsequentPage = false) => {
    // Header section
    if (!isSubsequentPage) {
      // Top accent bar
      doc.setFillColor(220, 38, 38); // Red #DC2626
      doc.rect(0, 0, pageWidth, 5, 'F');
      
      y = 18;
      // Main BRAND title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // slate-900 (#0F172A)
      doc.text('CADU PONCE', 20, y);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(220, 38, 38); // Red accent
      doc.text('CONSULTORIA ESPORTIVA', 77, y - 1);

      // Logo/brand line separator
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(20, y + 4, pageWidth - 20, y + 4);
      y += 12;
    } else {
      // Top accent bar on other pages
      doc.setFillColor(15, 23, 42); // Slate dark
      doc.rect(0, 0, pageWidth, 4, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`CADU PONCE | ${workout.name.toUpperCase()}`, 20, 12);
      
      doc.setDrawColor(226, 232, 240);
      doc.line(20, 14, pageWidth - 20, 14);
      y = 22;
    }

    // Footers
    const totalPages = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      'Documento gerado digitalmente pela Plataforma Cadu Ponce. Todos os direitos reservados.',
      20,
      pageHeight - 10
    );
    doc.text(`Página ${totalPages}`, pageWidth - 28, pageHeight - 10);
  };

  // Draw initial header
  drawHeaderAndFooter(false);

  // Gym Sheet Details
  doc.setFillColor(248, 250, 252); // slate-50 background
  doc.rect(20, y, pageWidth - 40, 22, 'F');
  doc.setDrawColor(241, 245, 249); // slate-100
  doc.rect(20, y, pageWidth - 40, 22, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`FICHA DE TREINO COMPLETA`, 24, y + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Nome do Aluno: `, 24, y + 12);
  doc.setFont('helvetica', 'bold');
  doc.text(studentName || 'Felippe Leitao', 51, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.text(`Criado em: `, 24, y + 17);
  doc.setFont('helvetica', 'bold');
  const dateFormatted = workout.createdAt ? new Date(workout.createdAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  doc.text(dateFormatted, 42, y + 17);

  // Right column for stats
  doc.setFont('helvetica', 'normal');
  doc.text(`Ficha:`, pageWidth - 80, y + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(workout.name || 'Treino do Dia', pageWidth - 68, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Exercícios:`, pageWidth - 80, y + 17);
  doc.setFont('helvetica', 'bold');
  doc.text(`${workout.exercises.length}`, pageWidth - 53, y + 17);

  y += 30;

  // Render Training Title Accent
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(220, 38, 38); // Crimson accent
  doc.text(`ROTEIRO DE EXERCÍCIOS`, 20, y);
  
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.8);
  doc.line(20, y + 2, 70, y + 2);
  y += 10;

  // Let's loop exercises and create organized "cards" or "blocks"
  workout.exercises.forEach((exercise, index) => {
    // Estimate heights needed (name, metrics row, notes block)
    // Headline: sets, reps, rest, current load.
    // Notes block with wrap support
    const nameText = `${index + 1}. ${exercise.name.toUpperCase()}`;
    const metricsText = `Séries: ${exercise.sets}   |   Reps: ${exercise.reps}   |   Descanso: ${exercise.rest}   |   Carga: ${exercise.currentLoad || 0} kg`;
    
    // Notes wrap calculation
    const notesStr = exercise.notes || '';
    const splitNotes = notesStr ? doc.splitTextToSize(notesStr, pageWidth - 50) : [];
    
    // Total estimated height: 5 (name) + 6 (metrics) + (notes ? (splitNotes.length * 4.5) + 6 : 0) + 7 (margins)
    const notesHeight = splitNotes.length ? (splitNotes.length * 4.5) + 6 : 0;
    const itemHeight = 16 + notesHeight;

    checkPageOverflow(itemHeight + 5);

    // Exercise Container Background Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240); // slate-200 border
    doc.setLineWidth(0.2);
    doc.rect(20, y, pageWidth - 40, itemHeight, 'FD');

    // Left Indicator Bar
    if (index % 2 === 0) {
      doc.setFillColor(220, 38, 38); // Brand Red
    } else {
      doc.setFillColor(15, 23, 42); // Dark Slate
    }
    doc.rect(20, y, 2.5, itemHeight, 'F');

    // Draw Exercise name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(nameText, 26, y + 5);

    // Draw metrics row
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(metricsText, 26, y + 10.5);

    // If notes exist, draw an inner box for trainer guidelines
    if (splitNotes.length > 0) {
      const notesY = y + 13;
      doc.setFillColor(254, 242, 242); // very light red-50
      doc.rect(26, notesY, pageWidth - 52, notesHeight - 2, 'F');
      
      // Draw small vertical guideline line
      doc.setDrawColor(252, 165, 165); // red-300
      doc.setLineWidth(0.4);
      doc.line(28, notesY + 1.5, 28, notesY + notesHeight - 3.5);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(185, 28, 28); // red-700
      doc.text('Instruções:', 31, notesY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      
      splitNotes.forEach((line: string, lineIdx: number) => {
        doc.text(line, 31, notesY + 8 + (lineIdx * 4.5));
      });
    }

    y += itemHeight + 4; // increment y coordinate
  });

  // Final motivational quote card at the end
  const quoteCardHeight = 22;
  checkPageOverflow(quoteCardHeight + 10);

  doc.setFillColor(15, 23, 42); // slate-900 bg
  doc.rect(20, y, pageWidth - 40, quoteCardHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('BORA PRA CIMA!', pageWidth / 2, y + 7, { align: 'center' });
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(220, 38, 38); // Crimson red
  doc.text('"O resultado vem da constância, faça o seu melhor a cada série."', pageWidth / 2, y + 12.5, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Acompanhe sua evolução e registre suas cargas no app!', pageWidth / 2, y + 17, { align: 'center' });

  // Download trigger
  const fileName = `Ficha_Treino_${workout.name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
