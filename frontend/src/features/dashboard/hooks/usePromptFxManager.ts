import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../../../lib/api";
import { confirmAction } from "../../../lib/notifications";
import {
  getPromptFxKey,
  getRecentPromptFxKeys,
  markPromptFxUsed as storePromptFxUsage,
  orderPromptFxByRecent,
} from "../lib/promptFxRecent";

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
  const [recentPromptFxKeys, setRecentPromptFxKeys] = useState<string[]>(() =>
    getRecentPromptFxKeys(),
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

  const orderedPromptFxList = useMemo(
    () => orderPromptFxByRecent(promptFxList, recentPromptFxKeys),
    [promptFxList, recentPromptFxKeys],
  );

  const markPromptFxUsed = (item: PromptFxItem) => {
    setRecentPromptFxKeys(storePromptFxUsage(item));
  };

  const getPromptFxOriginalIndex = (item: PromptFxItem) =>
    promptFxList.findIndex(
      (entry: PromptFxItem) => getPromptFxKey(entry) === getPromptFxKey(item),
    );

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

  const handleRemovePromptFx = async (indexToRemove: number) => {
    if (!(await confirmAction("Are you sure you want to delete this prompt preset?", { confirmLabel: "Delete" }))) return;
    const newList = promptFxList.filter((_: any, idx: number) => idx !== indexToRemove);
    savePromptFxMutation.mutate(newList);
  };

  return {
    promptFxList: orderedPromptFxList,
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
    markPromptFxUsed,
    getPromptFxOriginalIndex,
    isSavingPromptFx: savePromptFxMutation.isPending,
  };
}
