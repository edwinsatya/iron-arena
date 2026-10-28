const ROWS: [string, string, string][] = [
  ['Move, crouch, jump', 'W A S D', 'Arrows'],
  ['1 left punch', 'U', 'Num 4 or ['],
  ['2 right punch', 'I', 'Num 5 or ]'],
  ['3 left kick', 'J', 'Num 1 or ;'],
  ['4 right kick', 'K', "Num 2 or '"],
];

/** Key legend. `local` shows the second player's keys too. */
export function Controls({ local = false }: { local?: boolean }) {
  return (
    <table className="controls">
      <tbody>
        {ROWS.map(([what, p1, p2]) => (
          <tr key={what}>
            <th scope="row">{what}</th>
            <td>
              {p1.split(' ').map((k) => (
                <span key={k} className="kbd">
                  {k}
                </span>
              ))}
            </td>
            {local && (
              <td>
                <span className="kbd">{p2}</span>
              </td>
            )}
          </tr>
        ))}
        <tr>
          <th scope="row">Guard</th>
          <td colSpan={local ? 2 : 1} className="muted">
            Hold back (or stand still). Hold down-back for lows.
          </td>
        </tr>
      </tbody>
    </table>
  );
}
