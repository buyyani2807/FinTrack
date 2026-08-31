export const mergeAccountTransaction = (loans, accountId, transaction) => {
  if (!transaction) return loans;
  return (loans || []).map(item => item.id !== accountId ? item : {
    ...item,
    transactions: [...(item.transactions || []).filter(row => row.id !== transaction.id), transaction],
  });
};
