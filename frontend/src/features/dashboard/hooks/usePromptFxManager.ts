import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../../../lib/api";

type PromptFxItem = {
  name: string;
  prompt: string;
};

export function usePromptFxManager() {
  const queryClient = useQueryClient();

  const [showPromptFxMenu, setShowPromptFxMenu] = useState(false);
  const [newPromptFxName, setNewPromptFxName] = useState("");
  const [newPromptFxText, setNewPromptFxText] = useState("");
  const [isAddingPromptFx, setIsAddingPromptFx] = useState(false);
  const [editingPromptFxIndex, setEditingPromptFxIndex] = useState<number | null>(
    null,
  );

  const { data: promptFxList = [] } = useQuery({
    queryKey: ["prompt-fx"],
    queryFn: async () => {
      const res = await apiEndpoints.getPromptFx();
      return res.data.promptFx || [];
    },
  });

  const savePromptFxMutation = useMutation({
    mutationFn: (newPromptFx: PromptFxItem[]) => apiEndpoints.savePromptFx(newPromptFx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-fx"] });
      setNewPromptFxName("");
      setNewPromptFxText("");
      setIsAddingPromptFx(false);
      setEditingPromptFxIndex(null);
    },
  });

  const handleAddPromptFx = (e: FormEvent) => {
    e.preventDefault();
    if (!newPromptFxName.trim() || !newPromptFxText.trim()) return;

    const newList = [...promptFxList];
    if (editingPromptFxIndex !== null) {
      newList[editingPromptFxIndex] = {
        name: newPromptFxName.trim(),
        prompt: newPromptFxText.trim(),
      };
    } else {
      newList.push({ name: newPromptFxName.trim(), prompt: newPromptFxText.trim() });
    }

    savePromptFxMutation.mutate(newList);
  };

  const handleRemovePromptFx = (indexToRemove: number) => {
    if (!window.confirm("Are you sure you want to delete this prompt preset?")) return;
    const newList = promptFxList.filter((_: any, idx: number) => idx !== indexToRemove);
    savePromptFxMutation.mutate(newList);
  };

  return {
    promptFxList,
    showPromptFxMenu,
    setShowPromptFxMenu,
    newPromptFxName,
    setNewPromptFxName,
    newPromptFxText,
    setNewPromptFxText,
    isAddingPromptFx,
    setIsAddingPromptFx,
    editingPromptFxIndex,
    setEditingPromptFxIndex,
    handleAddPromptFx,
    handleRemovePromptFx,
    isSavingPromptFx: savePromptFxMutation.isPending,
  };
}
