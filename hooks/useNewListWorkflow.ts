'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPendingFile } from '@/lib/pendingFile';

interface NewListWorkflowResult {
  pendingUploadFile: File | null;
  newListDialogOpen: boolean;
  setPendingUploadFile: (file: File | null) => void;
  setNewListDialogOpen: (open: boolean) => void;
  handleNewListConfirm: (name: string, description: string, currency: string, customer: string, defaultViewId: string) => void;
  handleNewListCancel: () => void;
}

export function useNewListWorkflow(): NewListWorkflowResult {
  const router = useRouter();
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);

  const handleNewListConfirm = useCallback((name: string, description: string, _currency: string, customer: string, defaultViewId: string) => {
    if (!pendingUploadFile) return;
    setPendingFile(pendingUploadFile, name, description, customer, defaultViewId);
    setNewListDialogOpen(false);
    setPendingUploadFile(null);
    router.push('/parts-list');
  }, [pendingUploadFile, router]);

  const handleNewListCancel = useCallback(() => {
    setNewListDialogOpen(false);
    setPendingUploadFile(null);
  }, []);

  return {
    pendingUploadFile,
    newListDialogOpen,
    setPendingUploadFile,
    setNewListDialogOpen,
    handleNewListConfirm,
    handleNewListCancel,
  };
}
