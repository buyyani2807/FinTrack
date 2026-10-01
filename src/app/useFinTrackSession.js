import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { financeRolesAligned, ownerChromeAllowed, sessionUserRole, workspaceSessionAllowed } from "../features/finance/workspaceAccess.js";
import { legalViewFromLocation } from "../features/legal/LegalPage.jsx";
import { loadFinanceAccounts, loadWorkspace } from "../lib/financeRepository";
import { supabase } from "../lib/supabase";
import { useFinanceActions } from "./financeActions.js";

// Session, workspace and finance-account state for the whole app.
export function useFinTrackSession() {
  const isPasswordRecovery = new URLSearchParams(window.location.search).has("reset-password") || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
  const [legalView, setLegalView] = useState(() => legalViewFromLocation());
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loans, setLoans] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const navigate = useNavigate();
  const [dataError, setDataError] = useState("");
  const sessionGen = useRef(0);
  const userRoleRef = useRef(null);
  const beginSession = () => { sessionGen.current += 1; return sessionGen.current; };
  const isCurrentSession = gen => gen === sessionGen.current;
  const canApplyWorkspace = next => {
    const role = userRoleRef.current;
    return !role || role === "customer" || role === "chitCustomer" || financeRolesAligned(role, next?.role);
  };
  const clearFinanceState = () => {
    setLoans([]);
    setDataError("");
    setWorkspace(null);
    setUser(null);
  };
  const endInactiveFinanceSession = async () => {
    beginSession();
    userRoleRef.current = null;
    clearFinanceState();
    await supabase.auth.signOut();
  };
  useEffect(() => {
    const syncLegal = () => setLegalView(legalViewFromLocation());
    window.addEventListener("popstate", syncLegal);
    return () => window.removeEventListener("popstate", syncLegal);
  }, []);
  useEffect(() => {
    const gen = beginSession();
    let cancelled = false;
    supabase.auth.restoreSession()
      .then(async session => {
        if (!session?.access_token || cancelled || !isCurrentSession(gen)) return;
        const next = await loadWorkspace(session.access_token);
        if (cancelled || !isCurrentSession(gen)) return;
        if (!workspaceSessionAllowed(next)) {
          await supabase.auth.signOut();
          return;
        }
        flushSync(() => {
          setWorkspace(next);
          setUser({
            role: sessionUserRole(next.role),
            authToken: session.access_token,
            name: next.fullName,
          });
          userRoleRef.current = sessionUserRole(next.role);
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled && isCurrentSession(gen)) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);
  const refreshLoans = async (token = user?.authToken) => {
    if (!token) return;
    const gen = sessionGen.current;
    try {
      const next = await loadFinanceAccounts(token);
      if (!isCurrentSession(gen)) return;
      setLoans(next);
      setDataError("");
    } catch (error) {
      if (!isCurrentSession(gen)) return;
      setDataError(error.message || "Could not load finance records.");
    }
  };
  useEffect(() => {
    if (!user?.authToken) return undefined;
    const gen = sessionGen.current;
    let cancelled = false;
    loadFinanceAccounts(user.authToken)
      .then(next => {
        if (cancelled || !isCurrentSession(gen)) return;
        setLoans(next);
        setDataError("");
      })
      .catch(error => {
        if (cancelled || !isCurrentSession(gen)) return;
        setDataError(error.message || "Could not load finance records.");
      });
    return () => { cancelled = true; };
  }, [user?.authToken]);
  const enterSession = payload => {
    const { workspace: nextWorkspace, ...session } = payload;
    beginSession();
    setLoans([]);
    setDataError("");
    userRoleRef.current = session.role;
    flushSync(() => {
      setWorkspace(nextWorkspace || null);
      setUser(session);
    });
  };
  const refreshWorkspace = async (token = user?.authToken) => {
    if (!token) return null;
    const gen = sessionGen.current;
    try {
      const next = await loadWorkspace(token);
      if (!isCurrentSession(gen)) return null;
      if (!workspaceSessionAllowed(next)) {
        await endInactiveFinanceSession();
        return null;
      }
      if (!canApplyWorkspace(next)) return null;
      setWorkspace(next);
      return next;
    } catch {
      return null;
    }
  };
  useEffect(() => {
    if (!user?.authToken) return undefined;
    const gen = sessionGen.current;
    let cancelled = false;
    loadWorkspace(user.authToken)
      .then(async next => {
        if (cancelled || !isCurrentSession(gen)) return;
        if (!workspaceSessionAllowed(next)) {
          await endInactiveFinanceSession();
          return;
        }
        if (!canApplyWorkspace(next)) return;
        setWorkspace(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.authToken]);
  useLayoutEffect(() => {
    const role = ownerChromeAllowed(user?.role, workspace?.role) ? "owner"
      : user?.role === "agent" && workspace?.role === "staff" ? "staff"
      : "unknown";
    document.documentElement.dataset.ftRole = role;
    return () => { delete document.documentElement.dataset.ftRole; };
  }, [user?.role, workspace?.role]);
  const customerLoan = user?.role === "customer" ? user.loan : null;
  const logout = async () => {
    const role = user?.role;
    beginSession();
    userRoleRef.current = null;
    clearFinanceState();
    if (role === "financier" || role === "agent") await supabase.auth.signOut();
    navigate({ pathname: "/", search: window.location.search }, { replace: true });
  };
  const actions = useFinanceActions({ user, setLoans, refreshLoans });
  const financeSession = user?.role === "financier" || user?.role === "agent";
  const showOwnerChrome = ownerChromeAllowed(user?.role, workspace?.role);
  const waitingForWorkspaceRole = financeSession && !financeRolesAligned(user?.role, workspace?.role);
  const isLoading = (!authReady || waitingForWorkspaceRole) && !isPasswordRecovery;
  const enterCustomerSession = loan => setUser({ role: "customer", loan });
  const enterChitCustomerSession = session => setUser({ role: "chitCustomer", session });
  return {
    ...actions,
    isPasswordRecovery, legalView, isLoading, user, customerLoan, loans, setLoans, workspace, dataError,
    showOwnerChrome, enterSession, enterCustomerSession, enterChitCustomerSession,
    logout, refreshWorkspace,
  };
}
