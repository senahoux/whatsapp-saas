"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  contactId: string;
}

/**
 * Componente do botão para deletar um contato da clínica.
 * Pede confirmação antes de executar e recarrega a página ao concluir.
 */
export default function DeleteContactButton({ contactId }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    // 1. Confirmação do usuário
    if (!window.confirm("Atenção: Você tem certeza que deseja excluir permanentemente este contato e todos os seus dados vinculados (mensagens, conversas, agendamentos)?")) {
      return;
    }

    try {
      setIsDeleting(true);

      // 2. Chama a API de deleção
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // 3. Sucesso: Recarrega os dados (fala com o Server Component da página)
        window.location.reload();
      } else {
        const data = await res.json();
        alert(`Erro ao excluir contato: ${data.error || "Tente novamente mais tarde"}`);
        setIsDeleting(false);
      }
    } catch (err) {
      console.error("Delete contact error:", err);
      alert("Erro ao excluir contato: Falha na requisição.");
      setIsDeleting(false);
    }
  };

  return (
    <button
      className="btn-delete"
      onClick={handleDelete}
      disabled={isDeleting}
      title="Excluir paciente e histórico completo"
    >
      {isDeleting ? "Deletando..." : "Excluir"}
    </button>
  );
}
